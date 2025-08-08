start:
	sh start.sh

stop: #db-backup
	@echo "Stopping the project"
	docker-compose stop
	docker-compose down --volumes --remove-orphans
	@docker rm subletme_api || true
	@docker rm subletme_db || true

ps:
	- docker-compose ps

logs-db:
	- docker-compose logs -f subletme_db

logs-api:
	- docker-compose logs -f subletme_api

db-connect:
	- docker-compose exec subletme_db psql -U postgres postgres

db-migration:
	- docker-compose exec subletme_db psql -U postgres postgres -f migrations/$(number).sql

db-backup:
	- docker exec -i subletme_db /bin/bash -c "PGPASSWORD=postgres pg_dump --username postgres postgres" > db/backup.sql