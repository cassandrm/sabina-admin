import { Head } from "$fresh/runtime.ts";

export default function Error404() {
    return (
        <>
            <Head>
                <title>404 - Pagina non trovata</title>
            </Head>
            <div class="error-container">
                <h1>404 - Pagina non trovata</h1>
                <p>La pagina che stai cercando non esiste.</p>
                <a href="/">Torna alla home</a>
            </div>
        </>
    );
}
