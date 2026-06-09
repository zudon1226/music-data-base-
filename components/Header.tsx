type HeaderProps = {
  darkMode: boolean;
};

export default function Header({ darkMode }: HeaderProps) {
  return (
    <div
      style={{
        background: "linear-gradient(90deg,#ffe600,#ff9d5c,#ff5cb8)",
        boxShadow: darkMode ? "0 18px 35px rgba(0,0,0,0.28)" : "0 18px 35px rgba(0,0,0,0.12)",
        padding: 18,
        borderRadius: 20,
        color: "black",
        fontWeight: "bold",
        marginBottom: 20,
      }}
    >
      SPONSOR AD - V22 Creator Platform
    </div>
  );
}
