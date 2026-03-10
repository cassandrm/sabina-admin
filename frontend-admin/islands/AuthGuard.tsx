import { useEffect, useState } from "preact/hooks";
import { ComponentChildren } from "preact";

interface AuthGuardProps {
    children: ComponentChildren;
}

export default function AuthGuard({ children }: AuthGuardProps) {
    const [isChecking, setIsChecking] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Immediate check on mount
        const token = localStorage.getItem("authToken");

        if (!token) {
            // Redirect immediately if no token
            window.location.href = "/login";
        } else {
            setIsAuthenticated(true);
            setIsChecking(false);
        }
    }, []);

    // Show nothing while checking to avoid flash
    if (isChecking || !isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}
