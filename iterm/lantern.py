#!/usr/bin/env python3
# Adds a "Lantern" panel to iTerm2's toolbelt (View > Toolbelt) showing the lantern page.
# AutoLaunch runs it whenever iTerm2 starts; it stays running so the panel stays registered.
import iterm2


async def main(connection):
    await iterm2.tool.async_register_web_view_tool(
        connection, "Lantern", "com.dace.lantern", True, "http://127.0.0.1:7717/?panel")


iterm2.run_forever(main)
