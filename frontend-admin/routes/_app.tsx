import { Head } from "$fresh/runtime.ts";
import { PageProps } from "$fresh/server.ts";

export default function App({ Component }: PageProps) {
    return (
        <>
            <Head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Admin - Document Types</title>
                <link rel="stylesheet" href="/css/main.css" />
            </Head>
            <Component />
        </>
    );
}
