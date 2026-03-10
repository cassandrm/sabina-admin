export default function LogoutButton() {
    const handleLogout = () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("username");
        window.location.href = "/login";
    };

    return (
        <button
            onClick={handleLogout}
            style={{ padding: '0.5rem 1.25rem', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 600 }}
        >
            Logout
        </button>
    );
}
