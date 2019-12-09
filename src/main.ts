#!/usr/bin/env node

import program from "commander";
import path from "path";
import fs from "fs";
import chalk from "chalk";
import tm from "text-miner";
import axios from "axios";
import glob from "glob";

// Main caller function
(async function(){

    /***************************************************
     * Accepting in command flags for program operation
     **************************************************/
    program
        .option("-o, --output <dir>", "output directory")
        .option("-u, --url <url>", "URL to pull data from")
        .option("-d, --directory <dir>", "directory to pull data from");

    program.parse(process.argv);

    if(!program.directory && !program.url)
    {
        console.error(chalk.red("Error: ") + chalk.yellow("either input directory or url is required to define corpus"));
        process.exit(1);
    }


    /*******************************************
     * Initializing program input/output files *
     *******************************************/

    /** Output directory */
    let output = path.join(process.cwd(), program.output || "");

    /** Input directory */
    let input = program.directory ? path.join(process.cwd(), program.directory) : undefined;

    /** Regular console log */
    const log = console.log;

    /** Error console log */
    const err = console.error;

    // Checking existiance for output directory
    if(!fs.existsSync(output))
    {
        err(chalk.red("Error: ") + "Cannot find path " + chalk.yellow(output));
        process.exit(1);
    }

    // Checking existance for input directory
    if(input && !fs.existsSync(input))
    {
        err(chalk.red("Error: ") + "Cannot find path " + chalk.yellow(input));
        process.exit(1);
    }

    /********************
     * Reading in files *
     ********************/

    let corpus = new tm.Corpus();

    // Iterating input files
    if(input)
    {
        log(chalk.blue("Processing input files..."));
        for(const p of glob.sync(input + "/**/*"))
        {
            if(!fs.lstatSync(p).isDirectory())
            {
                log("    " + path.basename(p));
                corpus.addDoc(fs.readFileSync(p, "utf8"));
            }
        }
    }

    // Adding on url file
    if(program.url)
    {
        log(chalk.blue("Processing URL..."));
        let response = await axios.get(program.url);
        corpus.addDoc(response.data);
    }

    // removing whitespace
    log(chalk.blue("Removing extra whitespace..."));
    corpus.clean();

    // removing newline characters [\n]
    log(chalk.blue("Removing newlines..."));
    corpus.removeNewlines();

    // Creating Term Document Matrix
    log(chalk.blue("Creating Term Document Matrix..."));
    let terms = new tm.TermDocumentMatrix(corpus);

    log(chalk.green("Scanning Complete!"));
    log(`
    Documents: ${chalk.green(terms.nDocs)}
    Terms: ${chalk.green(terms.nTerms)}
    `);
    log("Starting CLI");

    // CLI Loop
    log("Enter a command:")
    process.stdout.write("$ ");
    process.openStdin().addListener("data", (d) =>
    {
        switch(d.toString().trim())
        {
            case "h":
            case "help":
                log("Help info");
                break;
            case "":
            case "e":
            case "exit":
                process.exit(0);
                break;
            default:
                log(chalk.red("Unrecognized input: ") + chalk.yellow(d));
        }
        process.stdout.write("$ ");
    });
})();