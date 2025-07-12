# SillyTavern Multi-API Group Chat Extension

Enable different characters in group chats to use different API endpoints. Perfect for comparing responses from different models or creating diverse AI conversations.

## Features

- 🎭 **Per-Character API Assignment** - Each character in a group chat can use a different API/model
- 🔧 **Full GUI Configuration** - No command line or code editing required
- 🔄 **Hot-swappable APIs** - Switch between APIs seamlessly during conversations
- 📦 **Import/Export Settings** - Share configurations between installations
- 🎯 **Auto-Assignment** - Automatically assign APIs to new characters
- 🔌 **Compatible with All SillyTavern APIs** - Works with OpenAI, Claude, local models, and more

## Installation

### Method 1: Direct Download
1. Download the latest release from the [Releases](https://github.com/yourusername/st-multi-api-chat/releases) page
2. Extract the `multi-api-chat` folder to `SillyTavern/public/scripts/extensions/third-party/`
3. Restart SillyTavern

### Method 2: Git Clone
```bash
cd SillyTavern/public/scripts/extensions/third-party/
git clone https://github.com/yourusername/st-multi-api-chat.git multi-api-chat
```

### Method 3: Git Submodule (Recommended for developers)
```bash
cd SillyTavern
git submodule add https://github.com/yourusername/st-multi-api-chat.git public/scripts/extensions/third-party/multi-api-chat
git submodule update --init --recursive
```

## Usage

1. **Open Extension Settings**: Look for "Multi-API