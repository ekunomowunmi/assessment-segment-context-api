.PHONY: help setup install test test-cov migrate up down logs clean dev worker

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
	@echo "  make dev        - Start development server"
	@echo "  make worker     - Start context worker"
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
	npm test

test-cov:
	npm test -- --coverage --coverageReporters=lcov --coverageReporters=html --coverageReporters=text

dev:
	npm run dev

worker:
	npm run worker

clean:
	rm -rf node_modules/.cache
	rm -rf coverage
	rm -rf .jest-cache
	find . -type d -name "node_modules" -prune -o -name ".DS_Store" -type f -delete
