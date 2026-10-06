exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { title, body, token } = JSON.parse(event.body || "{}");

    if (!title || !body || !token) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "title, body och token krävs",
        }),
      };
    }

    console.log("Push-funktion mottog:", {
      title,
      body,
      token: token.slice(0, 12) + "...",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "Funktionen fungerar",
      }),
    };
  } catch (error) {
    console.error("send-notification error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }
};