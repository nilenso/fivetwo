---
description: Create a new fivetwo card from the user's message
---
Create a new fivetwo card from the user's message.

1. Detect the current project from `git remote get-url origin`
2. Parse the URL to extract host, owner, and repository
3. Parse the user's message:
   - First line (or sentence) becomes the title
   - Everything after becomes the description
4. Use the fivetwo-create-card.sh tool to create the card with:
   - `--project-id` set to `host/owner/repo` (e.g., `github.com/owner/repo`)
   - `--title` set to the first line/sentence
   - `--description` set to the rest (if any)
5. Report success with the created card ID
