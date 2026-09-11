from typing import Optional

def update_username(username: str) -> Optional[str]:
  """Updates the current user's name"""
  set_variable("username", username)