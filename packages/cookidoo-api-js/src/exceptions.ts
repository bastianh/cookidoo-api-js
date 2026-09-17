/** Cookidoo API exceptions. */

/** General exception occurred. */
export class CookidooException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** When the config is invalid. */
export class CookidooConfigException extends CookidooException {}

/** When an authentication error is encountered. */
export class CookidooAuthException extends CookidooException {}

/** When data could not be parsed. */
export class CookidooParseException extends CookidooException {}

/** When a request returns an error. */
export class CookidooRequestException extends CookidooException {}

/** When a response could not be parsed. */
export class CookidooResponseException extends CookidooException {}

/** When the network or server is not available. */
export class CookidooUnavailableException extends CookidooException {}
