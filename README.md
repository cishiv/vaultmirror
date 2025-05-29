> Disclaimer: I built this for my own use. No promises it'll work well for you.
> 
# Vault Mirror Plugin

A straightforward plugin for copying files between two vaults.

I use this to move files out of my private vault into a vault 
that uses [Obsidian Publish](https://obsidian.md/publish) - https://shivan.dev 

![example](/example/example.png)

## FAQ

- Q: Why not just copy-paste?
- A: ¯\_(ツ)_/¯

## Troubleshooting

- **"Please configure both vault paths"**: Set up both source and target paths in settings
- **"Vault path does not exist"**: Verify the paths exist and are accessible
- **"No .md files found"**: Check if the vault contains any markdown files
- **Copy errors**: Ensure you have write permissions to the target vault directory

## Development

Built with TypeScript and the official Obsidian Plugin API.

### Building

```bash
npm install && npm run dev
```
