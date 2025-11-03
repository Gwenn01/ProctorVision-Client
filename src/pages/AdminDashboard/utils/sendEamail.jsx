import emailjs from "@emailjs/browser";

export const sendVerificationEmail = async ({
  to_email,
  to_name,
  username,
  password,
  link,
}) => {
  try {
    // Prepare the template parameters
    const templateParams = {
      to_name, // Name of the user
      username, // Username of the user
      password, // Password of the user (ensure you send it securely)
      link, // Verification link
      to_email, // User's email
    };

    // Send email using EmailJS
    const result = await emailjs.send(
      "service_vxd69mg", // Replace with your actual EmailJS Service ID
      "template_epnlvbr", // Replace with your EmailJS Template ID
      templateParams, // Use the dynamic template parameters
      "tEd5iWqPCi7GXWqap" // Replace with your EmailJS User ID
    );

    console.log("Email sent:", result.text);
    return true; // Return success if the email is sent
  } catch (error) {
    console.error("Email send failed:", error.text || error);
    return false; // Return failure if there's an error
  }
};
