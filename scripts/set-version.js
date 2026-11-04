// In GitHub Actions: stamps the pushed tag (for example v4.0.0) as the version of both apps.
const fs = require('fs');
const version = process.env.GITHUB_REF_NAME.replace(/^v/, '');
for (const file of ['app/package.json', 'app-lite/package.json']) {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
}
