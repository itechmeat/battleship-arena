.PHONY: fix

fix:
	bun run lint:fix -- backend web
	bun run fmt -- backend web
