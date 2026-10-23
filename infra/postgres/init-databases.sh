#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v identity_password="$IDENTITY_DB_PASSWORD" \
  -v job_password="$JOB_DB_PASSWORD" \
  -v verification_password="$VERIFICATION_DB_PASSWORD" \
  -v student_password="$STUDENT_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE uip_identity LOGIN PASSWORD %L', :'identity_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uip_identity') \gexec
SELECT format('CREATE ROLE uip_job LOGIN PASSWORD %L', :'job_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uip_job') \gexec
SELECT format('CREATE ROLE uip_verification LOGIN PASSWORD %L', :'verification_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uip_verification') \gexec
SELECT format('CREATE ROLE uip_student LOGIN PASSWORD %L', :'student_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uip_student') \gexec

SELECT 'CREATE DATABASE identity_db OWNER uip_identity'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'identity_db') \gexec
SELECT 'CREATE DATABASE job_db OWNER uip_job'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'job_db') \gexec
SELECT 'CREATE DATABASE verification_db OWNER uip_verification'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'verification_db') \gexec
SELECT 'CREATE DATABASE student_db OWNER uip_student'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'student_db') \gexec
SQL
