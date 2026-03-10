import { signal } from "@preact/signals";
import { JSX } from "preact";

interface LoginState {
    username: string;
    password: string;
    loading: boolean;
    error: string | null;
}

const loginState = signal<LoginState>({
    username: "",
    password: "",
    loading: false,
    error: null,
});

export default function LoginForm() {
    const handleSubmit = async (e: Event) => {
        e.preventDefault();

        loginState.value = {
            ...loginState.value,
            loading: true,
            error: null,
        };

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: loginState.value.username,
                    password: loginState.value.password,
                }),
            });

            if (!response.ok) {
                throw new Error("Login fallito");
            }

            const data = await response.json();

            if (data.success && data.token) {
                // Save token in localStorage
                localStorage.setItem("authToken", data.token);
                localStorage.setItem("username", loginState.value.username);

                // Redirect to homepage
                window.location.href = "/";
            } else {
                throw new Error(data.message || "Login fallito");
            }
        } catch (error) {
            loginState.value = {
                ...loginState.value,
                loading: false,
                error: error instanceof Error ? error.message : "Errore durante il login",
            };
        }
    };

    const handleUsernameChange = (e: JSX.TargetedEvent<HTMLInputElement>) => {
        loginState.value = {
            ...loginState.value,
            username: (e.target as HTMLInputElement).value,
        };
    };

    const handlePasswordChange = (e: JSX.TargetedEvent<HTMLInputElement>) => {
        loginState.value = {
            ...loginState.value,
            password: (e.target as HTMLInputElement).value,
        };
    };

    return (
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <h1>Admin Panel</h1>
                    <p>Document Types Management</p>
                </div>

                <form onSubmit={handleSubmit} class="login-form">
                    {loginState.value.error && (
                        <div class="error-message">
                            {loginState.value.error}
                        </div>
                    )}

                    <div class="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            value={loginState.value.username}
                            onInput={handleUsernameChange}
                            placeholder="Inserisci username"
                            required
                            disabled={loginState.value.loading}
                        />
                    </div>

                    <div class="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={loginState.value.password}
                            onInput={handlePasswordChange}
                            placeholder="Inserisci password"
                            required
                            disabled={loginState.value.loading}
                        />
                    </div>

                    <button
                        type="submit"
                        class="login-button"
                        disabled={loginState.value.loading}
                    >
                        {loginState.value.loading ? "Login in corso..." : "Accedi"}
                    </button>
                </form>
            </div>
        </div>
    );
}
