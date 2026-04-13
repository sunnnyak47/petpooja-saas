#!/bin/bash
# Run this before switching agents
# Updates PROJECT_STATUS.md with latest state

echo "🔄 Updating project status..."
echo "Last Updated: $(date)" >> PROJECT_STATUS.md
echo "Git commit: $(git log -1 --oneline)" >> PROJECT_STATUS.md
echo "✅ Status file updated"
echo "📌 Now commit and push to GitHub:"
echo "   git add PROJECT_STATUS.md"
echo "   git commit -m 'chore: update project status'"
echo "   git push"
