.PHONY: install run dev clean help venv free-port

# Default target
help:
	@echo "BodyCart Backend - Available commands:"
	@echo "  make install  - Install Python dependencies"
	@echo "  make venv     - Create a local Python virtualenv"
	@echo "  make run      - Run the backend server"
	@echo "  make dev      - Run the backend server with auto-reload"
	@echo "  make free-port - Kill whatever is listening on port 8000"
	@echo "  make clean    - Remove Python cache files"

# Install dependencies
install:
	pip3 install -r backend/requirements.txt

venv:
	python3 -m venv .venv
	@echo "Run 'source .venv/bin/activate' before installing or running the server."

# Run backend server (loads .env automatically via python-dotenv)
run: free-port
	cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000

# Run backend server with auto-reload for development (loads .env automatically)
dev: free-port
	cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Ensure port 8000 is free before running
free-port:
	@echo "Releasing port 8000 if already in use..."
	@lsof -ti tcp:8000 | xargs -r kill

# Clean up cache files
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

