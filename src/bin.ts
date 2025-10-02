#!/usr/bin/env node

import process from "node:process";
import React from "react";
import { Glace } from "./mods/glace/mod.tsx";

React;

await new Glace(process.argv.slice(2)).bundle()

close()