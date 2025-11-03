import React from "react";

const VerificationSuccess = () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#f4f4f4",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "40px",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
          width: "100%",
          maxWidth: "600px",
        }}
      >
        <h1 style={{ color: "#2d3748" }}>Proctor Vision</h1>
        <p>Your account has been successfully verified!</p>
        <p
          style={{
            fontSize: "24px",
            color: "#38a169",
            marginTop: "20px",
            fontWeight: "bold",
          }}
        >
          User Verified Successfully!
        </p>
        <p>
          If you have any questions or need assistance, feel free to contact
          support.
        </p>
      </div>
    </div>
  );
};

export default VerificationSuccess;
