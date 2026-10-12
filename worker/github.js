// Create an issue in the app's repository with a fine-grained token that can
// only write issues there.
export async function createIssue(env, issue) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rowhether-suggest',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(issue)
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return { number: data.number, url: data.html_url };
}
