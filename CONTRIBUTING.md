# Contributing to afk-claude

Thank you for your interest in contributing to afk-claude! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our code of conduct: be respectful, inclusive, and constructive in all interactions.

## How to Contribute

### Reporting Issues

- Check existing issues before creating a new one
- Use clear, descriptive titles
- Include steps to reproduce the issue
- Mention your Node.js version and operating system
- Include relevant error messages or logs

### Suggesting Features

- Open an issue with the `enhancement` label
- Clearly describe the feature and its use case
- Explain why this feature would be useful

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests: `npm test`
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/afk-claude.git
cd afk-claude

# Install and test
npm test

# Run specific tests
npm run test:permissions
npm run test:integration
```

### Code Style

- Use 2 spaces for indentation
- Keep lines under 120 characters when possible
- Use meaningful variable and function names
- Add comments for complex logic
- Follow existing patterns in the codebase

### Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Test with different Node.js versions (18+)

### Documentation

- Update README.md if adding new features
- Include JSDoc comments for new functions
- Update examples if behavior changes

## Project Structure

```
afk-claude/
├── bin/
│   ├── afk           # Main CLI executable
│   └── afk-debug     # Debug version with verbose logging
├── test/
│   ├── fixtures/     # Test configuration files
│   ├── run-tests.sh  # Test runner script
│   └── *.js          # Test suites
└── package.json
```

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create a GitHub release with release notes
4. Tag the release with semantic versioning

## Questions?

Feel free to open an issue for any questions about contributing.