
export const getNextScreen = async (decryptedBody, business_phone_number_id, flow_name) => {
  const { screen, data, version, action, flow_token } = decryptedBody;
  
  // Handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // Handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        acknowledged: true,
      },
    };
  }

  // Handle initial request when opening the flow
  if (action === "INIT") {
    // You can route to different initial screens based on flow_name here
    return {
      screen: "MY_SCREEN",
      data: {
        greeting: "Hey there! 👋",
      },
    };
  }

  if (action === "data_exchange") {
    // Route to the appropriate flow handler based on flow_name
    switch (flow_name) {
      case "Feedback Form":
        return handleFeedbackFormFlow(screen, data, flow_token);
      default:
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};

const handleFeedbackFormFlow = async (screen, data, flow_token) => {
  switch (screen) {
    case "WELCOME":
      return {
        screen: "RATING",
        data: {}
      };
      
    case "RATING":
      return {
        screen: "SPECIFIC_FEEDBACK",
        data: {}
      };
      
    case "SPECIFIC_FEEDBACK":
      return {
        screen: "COMMENTS",
        data: {}
      };
      
    case "COMMENTS":
      return {
        screen: "THANK_YOU",
        data: {}
      };
      
    case "THANK_YOU":
      return {
        screen: "SUCCESS",
        data: {
          extension_message_response: {
            params: {
              flow_token,
            },
          },
        },
      };
      
    default:
      console.error(`Unhandled screen in feedback form flow: ${screen}`);
      throw new Error(`Unhandled screen in feedback form flow: ${screen}`);
  }
};
