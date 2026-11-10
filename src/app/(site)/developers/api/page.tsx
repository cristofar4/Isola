import type { Metadata } from "next";
import Link from "next/link";
import { ApiAccessPanel } from "@/components/docs/api-access-panel";
import { ApiPlayground } from "@/components/docs/api-playground";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";
import { planConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "API quickstart · Developer docs",
  description: "Create an API key and remove backgrounds from your own code with ISOLA's public API.",
};

const curl = `curl -X POST https://your-deployment.example/api/v1/remove-background \\
  -H "Authorization: Bearer $ISOLA_API_KEY" \\
  -F "image=@photo.jpg" \\
  -o cutout.png
`;

const node = `import { readFile, writeFile } from "node:fs/promises";

const form = new FormData();
form.append("image", new Blob([await readFile("photo.jpg")]), "photo.jpg");

const res = await fetch("https://your-deployment.example/api/v1/remove-background", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.ISOLA_API_KEY}\` },
  body: form,
});
if (!res.ok) throw new Error((await res.json()).error.message);
await writeFile("cutout.png", Buffer.from(await res.arrayBuffer()));
`;

const python = `import os
import requests

with open("photo.jpg", "rb") as image:
    res = requests.post(
        "https://your-deployment.example/api/v1/remove-background",
        headers={"Authorization": f"Bearer {os.environ['ISOLA_API_KEY']}"},
        files={"image": image},
        data={"format": "png"},
    )
res.raise_for_status()
with open("cutout.png", "wb") as out:
    out.write(res.content)
`;

const background = `curl -X POST https://your-deployment.example/api/v1/remove-background \\
  -H "Authorization: Bearer $ISOLA_API_KEY" \\
  -F "image=@product.jpg" \\
  -F "background=#FFFFFF" \\
  -F "format=jpeg" \\
  -o product-white.jpg
`;

const me = `curl https://your-deployment.example/api/v1/me \\
  -H "Authorization: Bearer $ISOLA_API_KEY"
`;

export default function ApiQuickstartPage() {
  return (
    <>
      <DocHeader
        href="/developers/api"
        title="Remove backgrounds from your code."
        lead="The ISOLA API takes an image and returns a cutout with real transparency, processed on the server by the same Standard model the app uses."
        badge="Public API"
      />
      <DocBody>
        <DocCallout title="Your plan applies to the API too.">
          <p>
            Free keys return watermarked cutouts up to {planConfig.freeMaxExportSide.toLocaleString("en-US")}px on the longest
            side. Pro keys return full resolution with no watermark, and masks. The server applies these rules, so they
            hold for every request.
          </p>
        </DocCallout>

        <H2 id="get-key">1. Create a key</H2>
        <ApiAccessPanel next="/developers/api" />
        <ol>
          <li>
            Sign in and open your <Link href="/account">Account page</Link>.
          </li>
          <li>
            Under <strong>API keys</strong>, name the key (for example &quot;Shop backend&quot;) and choose{" "}
            <strong>Create key</strong>.
          </li>
          <li>
            Copy it straight away. Only a hash is stored, so the key can&apos;t be shown again; if you lose it, delete it and
            create another.
          </li>
        </ol>
        <p>
          Keep keys on your server, in an environment variable such as <code>ISOLA_API_KEY</code>. Anyone with a key can use
          your account&apos;s API allowance.
        </p>

        <H2 id="first-request">2. Send an image</H2>
        <p>
          Post the image as <code>multipart/form-data</code> in an <code>image</code> field (or as the raw body with its
          image content type). The response is the PNG itself.
        </p>
        <CodeTabs
          label="First request"
          tabs={[
            { id: "curl", label: "curl", content: <CodeBlock title="Remove a background" code={curl} lang="bash" /> },
            { id: "node", label: "Node.js", content: <CodeBlock title="remove-background.mjs" code={node} lang="js" /> },
            { id: "python", label: "Python", content: <CodeBlock title="remove_background.py" code={python} lang="python" /> },
          ]}
        />

        <H2 id="options">3. Choose the output</H2>
        <p>Send options as form fields (or query parameters). For a white background as a JPEG:</p>
        <CodeBlock title="Product on white" code={background} lang="bash" />
        <ul>
          <li>
            <code>format</code>: <code>png</code> (default) or <code>jpeg</code>.
          </li>
          <li>
            <code>background</code>: <code>transparent</code> (default) or a colour like <code>#F5F6F3</code>.
          </li>
          <li>
            <code>output</code>: <code>cutout</code> (default) or <code>mask</code> (greyscale PNG; Pro).
          </li>
        </ul>
        <p>
          Check a key, its plan and how many requests are left this hour without using one up:
        </p>
        <CodeBlock title="Check a key" code={me} lang="bash" />

        <H2 id="playground">Try it</H2>
        <p>Send a real request to this site&apos;s API with your key. It counts towards the key&apos;s hourly limit.</p>
        <ApiPlayground />

        <p>
          Every parameter, header and error is in the <Link href="/developers/api-reference">API reference</Link>.
        </p>
        <DocFooter href="/developers/api" />
      </DocBody>
    </>
  );
}
