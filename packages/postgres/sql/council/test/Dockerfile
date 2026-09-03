FROM postgres:17-bookworm

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    libtap-parser-sourcehandler-pgtap-perl \
    postgresql-17-pgtap \
  && rm -rf /var/lib/apt/lists/*
