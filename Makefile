.PHONY: help setup install test test-cov migrate up down logs clean

help:
	@echo "Available commands:"
	@echo "  make setup      - Initial setup (install dependencies)"
	@echo "  make install    - Install Node.js dependencies"
	@echo "  make migrate    - Run database migrations"
	@echo "  make up         - Start Docker services"
	@echo "  make down       - Stop Docker services"
	@echo "  make logs       - View Docker logs"
	@echo "  make test       - Run tests"
	@echo "  make test-cov   - Run tests with coverage report"
	@echo "  make clean      - Clean up generated files"

setup:
	@./setup.sh

install:
	npm install

migrate:
	npm run migrate

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

test:
	pytest

test-cov:
	pytest --cov=app --cov-report=html --cov-report=term-missing

clean:
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".pytest_cache" -exec rm -r {} +
	find . -type d -name "htmlcov" -exec rm -r {} +
	find . -type d -name ".coverage" -delete
