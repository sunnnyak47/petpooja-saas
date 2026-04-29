#!/bin/bash
# Run this once after dragging MS-RM System to Applications
# if macOS shows "app is damaged" or "cannot be opened"
echo "Removing macOS quarantine flag from MS-RM System..."
xattr -cr "/Applications/MS-RM System.app"
codesign --deep --force --sign - "/Applications/MS-RM System.app"
echo "Done! You can now open MS-RM System normally."
