echo "Stopping the project"
docker-compose stop
docker-compose down --volumes --remove-orphans
docker rm subletme_api || true
docker rm subletme_db || true
echo "Starting the project"
docker-compose up -d --build
# docker-compose exec subletme_db psql -U postgres postgres -f migrations/migration_004.sql