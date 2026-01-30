from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class AuthLoginCommandSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login: str = Field(min_length=1)
    password: str = Field(min_length=1)

    @staticmethod
    def _strip(value: str) -> str:
        return value.strip()

    @classmethod
    def _validate_not_empty(cls, value: str) -> str:
        trimmed = cls._strip(value)
        if not trimmed:
            raise ValueError("Value cannot be empty")
        return trimmed

    def model_post_init(self, __context: object) -> None:
        self.login = self._validate_not_empty(self.login)
        self.password = self._validate_not_empty(self.password)


class AuthUserSchema(BaseModel):
    id: int
    login: str


class AuthLoginResponseWithTokenSchema(BaseModel):
    token: str
    user: AuthUserSchema


class AuthLoginResponseWithoutTokenSchema(BaseModel):
    user: AuthUserSchema


AuthLoginResponseSchema = Union[
    AuthLoginResponseWithTokenSchema,
    AuthLoginResponseWithoutTokenSchema,
]
