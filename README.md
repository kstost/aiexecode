# AIEXEcode

<div align="center">

**AI-Powered Autonomous Coding Assistant**

*by 코드깎는노인*

[Website](https://aiexecode.com) | [GitHub](https://github.com/kstost/aiexecode)

</div>

---

## What is this

**AIEXEcode** is a CLI tool where you simply describe what you want in natural language, and AI handles the coding for you.

Just say things like "fix the lint errors in this file" or "add login functionality", and the AI will analyze the code, create a plan, and execute it. No complex commands or configurations needed - just speak naturally.

### What you can do

- 🐛 **Bug Fixes**: "Fix the error that occurs during login"
- ✨ **Add Features**: "Create a profile editing feature"
- 🔄 **Refactoring**: "Clean up auth.js to make it more readable"
- 🧪 **Write Tests**: "Write test code for all APIs"
- 📝 **Documentation**: "Add description comments to main functions"

---

## Installation

### System Requirements

**Supported Operating Systems:**
- macOS
- Linux

**⚠️ Windows is not currently supported.**

### 1. Install ripgrep (Required)

**macOS:**
```bash
brew install ripgrep
```

**Ubuntu/Debian:**
```bash
sudo apt-get install ripgrep
```

**Fedora/CentOS:**
```bash
sudo dnf install ripgrep
```

**Arch Linux:**
```bash
sudo pacman -S ripgrep
```

### 2. Install AIEXEcode

```bash
npm install -g aiexecode
```

Done! The `aiexecode` command is now available everywhere.

---

## Getting Started

### Step 1: Initial Setup (First Time Only)

```bash
aiexecode
```

On first run, the setup wizard appears:
1. Enter API key
2. Select model

**Where to get API keys:**
- OpenAI: https://platform.openai.com/account/api-keys

### Step 2: Using It

**Interactive Mode (Recommended):**
```bash
aiexecode
```

A prompt appears, and you can enter your desired task:
```
> Refactor the user authentication module
> Fix all lint errors
> /exit
```

**Quick Execution (Optional):**
```bash
aiexecode "simple task"
```

That's all there is to it!

---

## Frequently Used Features

### Continue Previous Work

You can pause work and continue later:

```bash
# First start
aiexecode
> Create large file processing feature
# Output: New session ID: abc1234567890def

# Continue later
aiexecode -c abc1234567890def
> Now add error handling too
```

### View Logs

If you're curious what the AI did, you can view it in a web browser:

```bash
aiexecode --viewer
```

Open `http://localhost:3300` in your browser to see:
- Commands executed by AI
- File modification history
- AI's thinking process

### Interactive Commands

Convenient commands you can use during conversation:

```bash
/help          # Help
/exit          # Exit
/clear         # Clear screen
/apikey        # Change API key
/model         # Change model
```

---

## Supported Models

AIEXEcode supports OpenAI GPT-5 series models:
- gpt-5
- gpt-5-mini (default)
- gpt-5-nano
- gpt-5-codex

Use `/model list` to see all available models or `/model <model-name>` to switch models.

---

## Advanced Features

### Project-Specific Customization

If you want different AI behavior for each project:

```bash
aiexecode --init
```

A `.aiexe/prompts/` folder is created where you can customize AI behavior.

### Extend with MCP Servers

If you need more powerful features, you can connect MCP servers:

```bash
# Connect GitHub
aiexecode mcp add --transport stdio github -- npx -y @modelcontextprotocol/server-github

# View connected servers
aiexecode mcp list
```

---

## Requirements

**Required:**
- macOS or Linux (Windows not supported)
- Node.js 14 or higher
- ripgrep (code search tool)
- OpenAI API key

**Optional:**
- Python 3 (for Python code execution support)

---

## Contact

- Website: https://aiexecode.com
- Report bugs: https://github.com/kstost/aiexecode/issues

---

<div align="center">

**AIEXEcode** - AI Coding Assistant for Developers

Made by 코드깎는노인

</div>
