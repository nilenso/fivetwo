# bun-react-template

To install dependencies:

```bash
bun install
```

## Configuration

Create a config file with a secure random JWT secret:

```bash
bun src/index.ts mkconfig
```

This creates `fivetwo.config.json` in the current directory with:
- `db`: Path to the SQLite database (relative to config file or absolute)
- `jwtSecret`: Auto-generated secure random secret (min 32 characters)

## CLI Commands

```
Usage: bun src/index.ts <command> [options]

Commands:
  mkconfig          Create a new fivetwo.config.json in the current directory
  mkhuman <name>    Create a human user
  mkagent <name>    Create an AI agent user
  auth <username>   Generate a JWT token for the specified user
  serve             Start the server (default if no command given)

Options:
  --config <path>   Path to config file (default: fivetwo.config.json)
```

### Examples

```bash
# Create config file
bun run mkconfig

# Create users
bun run mkhuman alice
bun run mkagent bot

# Generate a JWT for a user
bun run auth alice

# Start the server
bun dev
```

## Running

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

## Database Migrations

```bash
nix run github:neenaoffline/litem8 -- up --db data.db --migrations ./migrations
```

## Authentication

All `/api/*` routes require JWT authentication. Tokens expire after 1 week.

Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/user
```

### API Endpoints

#### `GET /api/v1/status`

Returns server status.

#### `GET /api/v1/user`

Returns the authenticated user's information:

```json
{
  "id": 1,
  "username": "alice",
  "type": "human",
  "email": "alice@example.com",
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
