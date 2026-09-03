#!/usr/bin/env bash
set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_dir="$(cd "${test_dir}/../../.." && pwd)"
image_name="hall-sql-pgtap:pg17"
container_name="hall-document-pgtap-${$}"
database_name="hall_document_test"

cleanup() {
  docker rm --force "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build --quiet --tag "${image_name}" --file "${package_dir}/sql/council/test/Dockerfile" \
  "${package_dir}/sql/council/test" >/dev/null
docker run --detach --rm \
  --name "${container_name}" \
  --env POSTGRES_DB="${database_name}" \
  --env POSTGRES_PASSWORD=hall-pgtap-only \
  --mount "type=bind,source=${package_dir},target=/work/postgres,readonly" \
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

{
  echo 'BEGIN;'
  while IFS= read -r manifest_path; do
    sed -n "1,99999p" "${package_dir}/${manifest_path}"
  done < <(sed -n 's/^  "\(sql\/.*\.sql\)",$/\1/p' "${package_dir}/src/schemaManifest.ts")
  echo 'COMMIT;'
} | docker exec --interactive "${container_name}" \
  psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}"

docker exec "${container_name}" \
  psql --set ON_ERROR_STOP=1 --username postgres --dbname "${database_name}" \
  --command 'CREATE EXTENSION pgtap;'

docker exec "${container_name}" sh -c \
  "pg_prove --username postgres --dbname '${database_name}' /work/postgres/sql/test/document/*.test.sql"
