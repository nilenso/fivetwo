# bun-react-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev --db data.db
```

To run for production:

```bash
bun start --db data.db
```

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Database Migrations

```bash
nix run github:neenaoffline/litem8 -- up --db data.db --migrations ./migrations
```
