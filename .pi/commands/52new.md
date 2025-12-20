---
description: Create a new fivetwo card with the given message as the title
---
Create a new fivetwo card. The user's message after the command is the card title.

1. Detect the current project from `git remote get-url origin`
2. Parse the URL to extract host, owner, and repository
3. Use the fivetwo-create-card.sh tool to create the card with:
   - `--project-id` set to `host/owner/repo` (e.g., `github.com/owner/repo`)
   - `--title` set to the user's message
4. Report success with the created card ID
