#!/usr/bin/env bash
set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sql_dir="$(cd "${test_dir}/.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "${temporary_dir}"' EXIT

production_requirements="${temporary_dir}/production-requirements"
covered_requirements="${temporary_dir}/covered-requirements"
used_error_codes="${temporary_dir}/used-error-codes"
catalogued_error_codes="${temporary_dir}/catalogued-error-codes"
asserted_error_codes="${temporary_dir}/asserted-error-codes"
asserted_native_codes="${temporary_dir}/asserted-native-codes"

find "${sql_dir}" -maxdepth 1 -type f -name '*.sql' -print0 \
  | xargs -0 grep -hEo '@(functional|technical)-requirement HALL-(FR|TR)-[A-Z]+-[0-9]{3}' \
  | sed -E 's/^@(functional|technical)-requirement //' \
  | sort > "${production_requirements}"

if [[ -n "$(uniq -d "${production_requirements}")" ]]; then
  echo "Requirement identifiers are reused:" >&2
  uniq -d "${production_requirements}" >&2
  exit 1
fi

find "${test_dir}" -maxdepth 1 -type f -name '*.test.sql' -print0 \
  | xargs -0 grep -hEo 'HALL-(FR|TR)-[A-Z]+-[0-9]{3}' \
  | sort -u > "${covered_requirements}"

if ! diff -u "${production_requirements}" "${covered_requirements}"; then
  echo "The pgTAP requirement coverage differs from the production annotations" >&2
  exit 1
fi

find "${sql_dir}" -maxdepth 1 -type f -name '*.sql' ! -name '002-error-codes.sql' -print0 \
  | xargs -0 grep -hEo "ERRCODE = 'HV[0-9]{3}'" \
  | grep -Eo 'HV[0-9]{3}' \
  | sort -u > "${used_error_codes}"

grep -Eo '^-- HV[0-9]{3}' "${sql_dir}/002-error-codes.sql" \
  | grep -Eo 'HV[0-9]{3}' \
  | sort > "${catalogued_error_codes}"

if [[ -n "$(uniq -d "${catalogued_error_codes}")" ]]; then
  echo "SQLSTATE catalogue entries are duplicated:" >&2
  uniq -d "${catalogued_error_codes}" >&2
  exit 1
fi

if ! diff -u "${catalogued_error_codes}" "${used_error_codes}"; then
  echo "Used and catalogued Hall SQLSTATE codes differ" >&2
  exit 1
fi

find "${test_dir}" -maxdepth 1 -type f -name '*.test.sql' -print0 \
  | xargs -0 grep -hEo "'HV[0-9]{3}'" \
  | grep -Eo 'HV[0-9]{3}' \
  | sort -u > "${asserted_error_codes}"

if ! diff -u "${catalogued_error_codes}" "${asserted_error_codes}"; then
  echo "Every catalogued Hall SQLSTATE must be asserted by pgTAP" >&2
  exit 1
fi

find "${test_dir}" -maxdepth 1 -type f -name '*.test.sql' -print0 \
  | xargs -0 grep -hEo "'235(02|03|05|14)'" \
  | tr -d "'" \
  | sort -u > "${asserted_native_codes}"

if ! diff -u <(printf '%s\n' 23502 23503 23505 23514) "${asserted_native_codes}"; then
  echo "The native NOT NULL, foreign-key, uniqueness and CHECK SQLSTATEs must all be asserted" >&2
  exit 1
fi

raise_count=$(find "${sql_dir}" -maxdepth 1 -type f -name '*.sql' ! -name '002-error-codes.sql' -print0 \
  | xargs -0 grep -hEc 'RAISE EXCEPTION' \
  | awk '{ total += $1 } END { print total + 0 }')
errcode_count=$(find "${sql_dir}" -maxdepth 1 -type f -name '*.sql' ! -name '002-error-codes.sql' -print0 \
  | xargs -0 grep -hEc "ERRCODE = 'HV[0-9]{3}'" \
  | awk '{ total += $1 } END { print total + 0 }')

if [[ "${raise_count}" != "${errcode_count}" ]]; then
  echo "Every RAISE EXCEPTION must carry one Hall ERRCODE (${raise_count} raises, ${errcode_count} codes)" >&2
  exit 1
fi

echo "Traceability OK: $(wc -l < "${production_requirements}" | tr -d ' ') requirements, ${raise_count} business raises, $(wc -l < "${catalogued_error_codes}" | tr -d ' ') Hall SQLSTATE codes and 4 native constraint codes"
