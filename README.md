# TabNest Browser Extension

TabNest is a browser extension for Chrome/Edge (with Firefox support planned) that allows users to save and restore their current tabs and tab groups with a single click.

## Features

- **One-Click Saving**: Save all current tabs and tab groups instantly
- **One-Click Restoration**: Restore entire sessions with a single click
- **Tab Group Support**: Properly preserve and restore tab groups
- **Modern UI**: Clean, minimal interface focused on usability
- **Full Dashboard**: Dedicated page for session management with search and filtering

## Development

### Project Structure

```
├── manifest.json       # Extension manifest
├── popup.html          # Popup interface
├── dashboard.html      # Full dashboard page
├── background.js       # Background script
├── css/
│   ├── popup.css       # Styles for popup
│   └── dashboard.css   # Styles for dashboard
├── js/
│   ├── popup.js        # JavaScript for popup
│   └── dashboard.js    # JavaScript for dashboard
└── icons/              # Extension icons
```

### Setup for Development

1. Clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions` or `edge://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder

### Building for Production

To package the extension for distribution:

1. Ensure all files are in place and working correctly
2. Create a ZIP file of the entire project folder
3. For Chrome: Upload to the Chrome Web Store Developer Dashboard
4. For Edge: Upload to the Microsoft Edge Add-ons Developer Dashboard

## Roadmap

See the [development-tickets.md](development-tickets.md) file for the detailed development roadmap.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
