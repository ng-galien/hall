#!/usr/bin/env bash
set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sql_dir="$(cd "${test_dir}/.." && pwd)"
package_sql_dir="$(cd "${test_dir}/../.." && pwd)"
image_name="hall-sql-pgtap:pg17"
container_name="hall-sql-pgtap-${$}"
database_name="hall_sql_test"

cleanup() {
  docker rm --force "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${test_dir}/verify-traceability.sh"

docker build --quiet --tag "${image_name}" --file "${test_dir}/Dockerfile" "${test_dir}" >/dev/null
docker run --detach --rm \
  --name "${container_name}" \
  --env POSTGRES_DB="${database_name}" \
  --env POSTGRES_PASSWORD=hall-pgtap-only \
  --mount "type=bind,source=${package_sql_dir},target=/work/sql,readonly" \
  "${image_name}" >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "${container_name}" \
    psql --quiet --tuples-only --username postgres --dbname "${database_name}" --command 'SELECT 1' \
    >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" == 60 ]]; then
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "${container_name}" \
  psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}" \
  --command "CREATE SCHEMA hall; CREATE SCHEMA hall_api; ALTER DATABASE ${database_name} SET search_path = hall, public, pg_catalog;"

for dependency_file in \
  /work/sql/directory/001-types.sql \
  /work/sql/directory/010-model.sql \
  /work/sql/document/001-types.sql \
  /work/sql/document/010-model.sql \
  /work/sql/document/020-rules.sql; do
  docker exec "${container_name}" \
    psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}" \
    --file "${dependency_file}"
done

while IFS= read -r schema_file; do
  docker exec --interactive "${container_name}" \
    psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}" \
    < "${schema_file}"
done < <(find "${sql_dir}" -maxdepth 1 -type f -name '*.sql' -print | sort)

docker exec "${container_name}" \
  psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}" \
  --command 'CREATE EXTENSION pgtap;'

if [[ "$#" -gt 0 ]]; then
  test_files=()
  for test_file in "$@"; do
    [[ "$test_file" =~ ^[a-zA-Z0-9_-]+\.test\.sql$ ]] || exit 2
    test_files+=("/work/sql/council/test/$test_file")
  done
  docker exec "${container_name}" pg_prove --verbose --username postgres --dbname "${database_name}" "${test_files[@]}"
else
  docker exec "${container_name}" sh -c \
    "pg_prove --username postgres --dbname '${database_name}' /work/sql/council/test/*.test.sql"
fi
