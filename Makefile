DATABASE_PATH ?= /tmp/battleship-arena-dev.db
LOCAL_RUN_DIR ?= /tmp/battleship-arena-dev
LOCAL_LOG_DIR := $(LOCAL_RUN_DIR)/logs
BACKEND_PORT := 8081
BACKEND_PID_FILE := $(LOCAL_RUN_DIR)/backend.pid
BACKEND_LOG := $(LOCAL_LOG_DIR)/backend.log
MOCK_TURN_DELAY_MS ?= 150
SHUTDOWN_GRACE_SEC ?= 5
WEB_HOST ?= 127.0.0.1
WEB_PORT ?= 4321
WEB_PID_FILE := $(LOCAL_RUN_DIR)/web.pid
WEB_LOG := $(LOCAL_LOG_DIR)/web.log

.PHONY: fix start stop

fix:
	bun run lint:fix -- backend web
	bun run fmt -- backend web

start:
	@mkdir -p "$(LOCAL_RUN_DIR)" "$(LOCAL_LOG_DIR)"
	@set -eu; \
	if ! { [ -f "$(BACKEND_PID_FILE)" ] && kill -0 "$$(cat "$(BACKEND_PID_FILE)")" 2>/dev/null; } && \
		command -v lsof >/dev/null 2>&1 && lsof -iTCP:$(BACKEND_PORT) -sTCP:LISTEN -n -P >/dev/null 2>&1; then \
		echo "Backend port $(BACKEND_PORT) is already in use."; \
		exit 1; \
	fi; \
	if ! { [ -f "$(WEB_PID_FILE)" ] && kill -0 "$$(cat "$(WEB_PID_FILE)")" 2>/dev/null; } && \
		command -v lsof >/dev/null 2>&1 && lsof -iTCP:$(WEB_PORT) -sTCP:LISTEN -n -P >/dev/null 2>&1; then \
		echo "Frontend port $(WEB_PORT) is already in use."; \
		exit 1; \
	fi
	@if [ -f "$(BACKEND_PID_FILE)" ] && kill -0 "$$(cat "$(BACKEND_PID_FILE)")" 2>/dev/null; then \
		echo "Backend already running on http://127.0.0.1:$(BACKEND_PORT) (PID $$(cat "$(BACKEND_PID_FILE)"))."; \
	else \
		rm -f "$(BACKEND_PID_FILE)"; \
		echo "Starting backend on http://127.0.0.1:$(BACKEND_PORT) with DATABASE_PATH=$(DATABASE_PATH)"; \
		( cd backend && exec nohup env DATABASE_PATH="$(DATABASE_PATH)" PORT="$(BACKEND_PORT)" MOCK_TURN_DELAY_MS="$(MOCK_TURN_DELAY_MS)" SHUTDOWN_GRACE_SEC="$(SHUTDOWN_GRACE_SEC)" bun --watch ./src/index.ts ) >"$(BACKEND_LOG)" 2>&1 & \
		echo $$! >"$(BACKEND_PID_FILE)"; \
	fi
	@if [ -f "$(WEB_PID_FILE)" ] && kill -0 "$$(cat "$(WEB_PID_FILE)")" 2>/dev/null; then \
		echo "Frontend already running on http://$(WEB_HOST):$(WEB_PORT) (PID $$(cat "$(WEB_PID_FILE)"))."; \
	else \
		rm -f "$(WEB_PID_FILE)"; \
		echo "Starting frontend on http://$(WEB_HOST):$(WEB_PORT)"; \
		( cd web && exec nohup bun run dev -- --host "$(WEB_HOST)" --port "$(WEB_PORT)" ) >"$(WEB_LOG)" 2>&1 & \
		echo $$! >"$(WEB_PID_FILE)"; \
	fi
	@sleep 1
	@if [ -f "$(BACKEND_PID_FILE)" ] && ! kill -0 "$$(cat "$(BACKEND_PID_FILE)")" 2>/dev/null; then \
		echo "Backend failed to start. Last log lines:"; \
		tail -n 40 "$(BACKEND_LOG)" 2>/dev/null || true; \
		rm -f "$(BACKEND_PID_FILE)"; \
		exit 1; \
	fi
	@if [ -f "$(WEB_PID_FILE)" ] && ! kill -0 "$$(cat "$(WEB_PID_FILE)")" 2>/dev/null; then \
		echo "Frontend failed to start. Last log lines:"; \
		tail -n 40 "$(WEB_LOG)" 2>/dev/null || true; \
		rm -f "$(WEB_PID_FILE)"; \
		exit 1; \
	fi
	@echo "Local project started."
	@echo "  Backend:  http://127.0.0.1:$(BACKEND_PORT)"
	@echo "  Frontend: http://$(WEB_HOST):$(WEB_PORT)"
	@echo "  Logs:     $(LOCAL_LOG_DIR)"

stop:
	@set -eu; \
	stop_service() { \
		name="$$1"; \
		pid_file="$$2"; \
		if [ ! -f "$$pid_file" ]; then \
			echo "$$name not running."; \
			return 0; \
		fi; \
		pid="$$(cat "$$pid_file")"; \
		if [ -z "$$pid" ]; then \
			rm -f "$$pid_file"; \
			echo "$$name not running."; \
			return 0; \
		fi; \
		if kill -0 "$$pid" 2>/dev/null; then \
			echo "Stopping $$name (PID $$pid)..."; \
			kill "$$pid" 2>/dev/null || true; \
			waited=0; \
			while kill -0 "$$pid" 2>/dev/null && [ "$$waited" -lt 50 ]; do \
				sleep 0.1; \
				waited=$$((waited + 1)); \
			done; \
			if kill -0 "$$pid" 2>/dev/null; then \
				echo "$$name did not stop after 5s; forcing it."; \
				kill -KILL "$$pid" 2>/dev/null || true; \
			fi; \
		else \
			echo "$$name not running (removing stale PID $$pid)."; \
		fi; \
		rm -f "$$pid_file"; \
	}; \
	stop_service "Frontend" "$(WEB_PID_FILE)"; \
	stop_service "Backend" "$(BACKEND_PID_FILE)"
