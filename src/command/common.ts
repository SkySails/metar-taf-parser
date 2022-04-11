import {
  IAbstractWeatherContainer,
  ICloud,
  IWind,
  IWindShear,
} from "model/model";
import * as converter from "commons/converter";
import { CloudQuantity, CloudType } from "model/enum";
import {
  InvalidWeatherStatementError,
  UnexpectedParseError,
} from "commons/errors";

interface ICommand {
  canParse(str: string): boolean;
  execute(container: IAbstractWeatherContainer, str: string): boolean;
}

/**
 * This function creates a wind element.
 * @param wind The wind object
 * @param direction The direction in degrees
 * @param speed The speed
 * @param gust The speed of the gust.
 * @param unit The speed unit
 */
function makeWind(
  direction: string,
  speed: string,
  gust: string,
  unit: string
): IWind {
  return {
    speed: +speed,
    direction: converter.degreesToCardinal(direction),
    degrees: direction !== "VRB" ? +direction : undefined,
    gust: gust ? +gust : undefined,
    unit: unit || "KT",
  };
}

export class CloudCommand implements ICommand {
  #cloudRegex = /^([A-Z]{3})(\d{3})?([A-Z]{2,3})?$/;

  parse(cloudString: string): ICloud | undefined {
    const m = cloudString.match(this.#cloudRegex);

    if (!m) return;

    const quantity = CloudQuantity[m[1] as CloudQuantity];
    const height = 100 * +m[2] || undefined;
    const type = CloudType[m[3] as CloudType];

    if (!quantity) return;

    return { quantity, height, type };
  }

  execute(container: IAbstractWeatherContainer, cloudString: string): boolean {
    const cloud = this.parse(cloudString);

    if (cloud) {
      container.clouds.push(cloud);
      return true;
    }

    return false;
  }

  canParse(cloudString: string): boolean {
    return this.#cloudRegex.test(cloudString);
  }
}

export class MainVisibilityCommand implements ICommand {
  #regex = /^(\d{4})(|NDV)$/;

  canParse(visibilityString: string) {
    return this.#regex.test(visibilityString);
  }

  execute(
    container: IAbstractWeatherContainer,
    visibilityString: string
  ): boolean {
    const matches = visibilityString.match(this.#regex);

    if (!matches) return false;

    const distance = converter.convertVisibility(matches[1]);

    if (!container.visibility) container.visibility = { distance };

    container.visibility.distance = distance;

    return true;
  }
}

export class WindCommand implements ICommand {
  #regex = /^(VRB|\d{3})(\d{2})G?(\d{2})?(KT|MPS|KM\/H)?/;

  canParse(windString: string): boolean {
    return this.#regex.test(windString);
  }

  parseWind(windString: string): IWind {
    const matches = windString.match(this.#regex);

    if (!matches) throw new UnexpectedParseError("Wind should be defined");

    return makeWind(matches[1], matches[2], matches[3], matches[4]);
  }

  execute(container: IAbstractWeatherContainer, windString: string): boolean {
    const wind = this.parseWind(windString);
    container.wind = wind;
    return true;
  }
}

export class WindVariationCommand implements ICommand {
  #regex = /^(\d{3})V(\d{3})/;

  canParse(windString: string): boolean {
    return this.#regex.test(windString);
  }

  parseWindVariation(wind: IWind, windString: string) {
    const matches = windString.match(this.#regex);

    if (!matches) throw new UnexpectedParseError("Wind should be defined");

    wind.minVariation = +matches[1];
    wind.maxVariation = +matches[2];
  }

  execute(container: IAbstractWeatherContainer, windString: string): boolean {
    if (!container.wind) throw new InvalidWeatherStatementError();

    this.parseWindVariation(container.wind, windString);
    return true;
  }
}

export class WindShearCommand implements ICommand {
  #regex = /^WS(\d{3})\/(\w{3})(\d{2})G?(\d{2})?(KT|MPS|KM\/H)/;

  canParse(windString: string): boolean {
    return this.#regex.test(windString);
  }

  parseWindShear(windString: string): IWindShear {
    const matches = windString.match(this.#regex);

    if (!matches)
      throw new UnexpectedParseError("Wind shear should be defined");

    return {
      ...makeWind(matches[2], matches[3], matches[4], matches[5]),
      height: 100 * +matches[1],
    };
  }

  execute(container: IAbstractWeatherContainer, windString: string): boolean {
    container.windShear = this.parseWindShear(windString);
    return true;
  }
}

export class VerticalVisibilityCommand implements ICommand {
  #regex = /^VV(\d{3})$/;

  execute(
    container: IAbstractWeatherContainer,
    visibilityString: string
  ): boolean {
    const matches = visibilityString.match(this.#regex);

    if (!matches)
      throw new UnexpectedParseError("Vertical visibility should be defined");

    container.verticalVisibility = 100 * +matches[1];
    return true;
  }

  canParse(windString: string): boolean {
    return this.#regex.test(windString);
  }
}

export class MinimalVisibilityCommand implements ICommand {
  #regex = /^(\d{4}[a-z])$/;

  execute(
    container: IAbstractWeatherContainer,
    visibilityString: string
  ): boolean {
    const matches = visibilityString.match(this.#regex);

    if (!matches)
      throw new UnexpectedParseError("Vertical visibility should be defined");
    if (!container.visibility)
      throw new UnexpectedParseError("container.visibility not instantiated");

    container.visibility.minDistance = +matches[1].slice(0, 4);
    container.visibility.minDirection = matches[1][4];

    return true;
  }

  canParse(windString: string): boolean {
    return this.#regex.test(windString);
  }
}

export class MainVisibilityNauticalMilesCommand implements ICommand {
  #regex = /^(\d)*(\s)?((\d\/\d)?SM)$/;

  execute(
    container: IAbstractWeatherContainer,
    visibilityString: string
  ): boolean {
    if (!container.visibility)
      container.visibility = { distance: visibilityString };

    container.visibility.distance = visibilityString;

    return true;
  }

  canParse(windString: string): boolean {
    return this.#regex.test(windString);
  }
}

export class CommandSupplier {
  #commands = [
    new WindShearCommand(),
    new WindCommand(),
    new WindVariationCommand(),
    new MainVisibilityCommand(),
    new MainVisibilityNauticalMilesCommand(),
    new MinimalVisibilityCommand(),
    new VerticalVisibilityCommand(),
    new CloudCommand(),
  ];

  get(input: string): ICommand | undefined {
    for (let i = 0; i < this.#commands.length; i++) {
      const command = this.#commands[i];

      if (command.canParse(input)) return command;
    }
  }
}