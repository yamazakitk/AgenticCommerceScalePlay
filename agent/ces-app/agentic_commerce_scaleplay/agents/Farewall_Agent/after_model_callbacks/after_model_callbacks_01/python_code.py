SURVEY_MESSAGE = "Click here to take our post call survey."

def after_model_callback(
    callback_context: CallbackContext,
    llm_response: LlmResponse
) -> Optional[LlmResponse]:
  for index, part in enumerate(llm_response.content.parts):
    if part.has_function_call('end_session'):
      return LlmResponse.from_parts(parts=[
        *llm_response.content.parts,
        Part.from_text(SURVEY_MESSAGE)

    ])
  return None