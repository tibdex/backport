declare module "probot-commands" {
  import { Application, Context } from "probot";

  const commands: (
    app: Application,
    name: string,
    callback: (
      context: Context,
      command: { arguments: string; name: string },
    ) => void,
  ) => void;

  export default commands;
}
