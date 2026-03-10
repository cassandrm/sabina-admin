import { Head } from "$fresh/runtime.ts";
import LoginForm from "../islands/LoginForm.tsx";

export default function LoginPage() {
    return (
        <>
            <Head>
                <title>Login - Admin</title>
            </Head>
            <LoginForm />
        </>
    );
}
