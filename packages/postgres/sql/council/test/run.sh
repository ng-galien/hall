#!/usr/bin/env bash
set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sql_dir="$(cd "${test_dir}/.." && pwd)"
package_sql_dir="$(cd "${test_dir}/../.." && pwd)"
image_name="hall-sql-pgtap:pg17"
container_name="hall-sql-pgtap-${$}"
database_name="hall_sql_test"

cleanup() {
  docker rm --force --volumes "${container_name}" >/dev/null 2>&1 || true
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

# Install the same complete canonical schema as the application. Council
# preparation now depends on documentary ownership and persisted notices.
{
  echo 'BEGIN;'
  while IFS= read -r manifest_path; do
    cat "${package_sql_dir}/../${manifest_path}"
  done < <(sed -n 's/^  "\(sql\/.*\.sql\)",$/\1/p' "${package_sql_dir}/../src/schemaManifest.ts")
  echo 'COMMIT;'
} | docker exec --interactive "${container_name}" \
  psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}"

docker exec "${container_name}" \
  psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}" \
  --command "ALTER DATABASE ${database_name} SET search_path = hall, public, pg_catalog; CREATE EXTENSION pgtap;"

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
