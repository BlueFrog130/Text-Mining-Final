#!/usr/bin/env node

import program from "commander";
import path from "path";
import fs from "fs";
import chalk from "chalk";
import tm from "text-miner";
import axios from "axios";
import glob from "glob";
import COUNTRIES from "./countries";

// Main caller function
(async function(){

    /***************************************************
     * Accepting in command flags for program operation
     **************************************************/
    program
        .name(chalk.blueBright("text-miner"))
        .option("-o, --output <dir>", "output directory")
        .option("-u, --url <url>", "URL to pull data from")
        .option("-d, --directory <dir>", "directory to pull data from")
        .option("--tf-idf", "converts term document matrix to tf-idf matrix")
        .option("-r, --remove-stopwords", "removes common english stopwords")
        .option("-p, --remove-sparse <percent>", "removes words that appear in less than " + chalk.yellow("<percent>") + " of documents", parseFloat)
        .option("-w, --remove-words <words>", "removes the coma-seperated list provided")
        .option("-e, --expand", "expands all contractions")
        .option("-n, --norm", "normalizes words")
        .option("-v, --vector", "creates " + chalk.yellow("vector.csv") + " file that represents normalized vectors based on term frequency diagram" )
        .option("-g, --graph", "outputs " + chalk.yellow("terms.png") + " file in output directory");

    program.parse(process.argv);

    if(!program.directory && !program.url)
    {
        console.error(chalk.red("Error: ") + chalk.yellow("either input directory or url is required to define corpus"));
        process.exit(1);
    }

    /*******************************************
     * Initializing program input/output files *
    ********************************************/

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
    *********************/

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
                let content = fs.readFileSync(p, "utf8");
                if(program.expand)
                    tm.expandContractions(content);
                corpus.addDoc(content);
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

    // Removing provided stopwords
    if(program.removeStopwords)
    {
        log(chalk.blue("Removing stopwords..."));
        corpus.removeWords(tm.STOPWORDS.EN);
    }

    if(program.norm)
    {
        log(chalk.blue("Normalizing country names..."));
        for(let doc of corpus.documents as { text: string }[])
        {
            for(let c of COUNTRIES)
            {
                doc.text.replace(c.code, c.name);
            }
        }
    }

    // Normalizing to lowercase
    log(chalk.blue("Converting to lowercase..."));
    corpus.toLower();

    // Removing punctuation
    log(chalk.blue("Removing all punctuation..."));
    corpus.removeInterpunctuation();

    if(program.removeWords)
    {
        log(chalk.blue("Removing words: " + program.removeWords.split(",").join(", ")));
        corpus.removeWords(program.removeWords.split(","));
    }

    // removing whitespace
    log(chalk.blue("Removing extra whitespace..."));
    corpus.clean();

    // removing newline characters [\n]
    log(chalk.blue("Removing newlines..."));
    corpus.removeNewlines();

    log(chalk.green("Scanning Complete!"));

    /**************************************
     * Converting data into tables/charts *
    ***************************************/

    let terms;
    // Creating Term Document Matrix
    log(chalk.blue("Creating Term Document Matrix..."));
    terms = new tm.DocumentTermMatrix(corpus);

    if(program.removeSparse)
    {
        log(chalk.blue("Removing sparce elements..."));
        terms = terms.removeSparseTerms(program.removeSparse);
    }
    terms.fill_zeros();

    log(`    Documents: ${chalk.green(terms.nDocs)}\n    Terms: ${chalk.green(terms.nTerms)}`);

    if(program.tfIdf)
    {
        terms.weighting(tm.weightTfIdf);
    }

    // Data holder
    let csv: string[][] = [];

    let header: string[] = [""];
    for(let n = 0; n < terms.nDocs; n++)
    {
        header.push("Document " + ( n + 1 ))
    }
    csv.push(header);

    for(let term = 0, len: number = terms.vocabulary.length; term < len; term++)
    {
        let vocab: string[] = terms.vocabulary;
        let row: string[] = [];
        row.push(vocab[term]);
        for(let doc of terms.data as number[])
        {
            row.push(doc[term]);
        }
        csv.push(row);
    }
    let data = csv.join("\n");

    fs.writeFileSync(path.join(output, "tdim.csv"), data, "utf8");

    if(program.vector)
    {
        log(chalk.blue("Creating vector table..."))
        let vectors: number[] = [];
        for(let n = 0; n < terms.nDocs; n++)
        {
            vectors.push(Math.sqrt(terms.data[n].reduce((acc, cur) => acc + Math.pow(cur, 2))));
        }

        // skipping header row
        for(let i = 1, len = csv.length; i < len; i++)
        {
            for(let c = 1, cLen = csv[i].length; c < cLen; c++)
            {
                csv[i][c] = (parseInt(csv[i][c]) / vectors[c - 1]).toString();
            }
        }

        fs.writeFileSync(path.join(output, "vectors.csv"), csv.join("\n"), "utf8");
    }

    if(program.graph)
    {
        log(chalk.blue("Drawing ") + chalk.yellow("terms.png"));
        let plotly = require("plotly")("BlueFrog", "e7f9bLYDqRIVOIQtpo8f");

        let groupedData = terms.findFreqTerms(1).sort((a, b) => b.count - a.count) as { word: string, count: number }[];

        let d = {
            x: groupedData.map((v) => v.word),
            y: groupedData.map((v) => v.count),
            type: "bar"
        };
        plotly.getImage({ "data": [d] }, { format: "png", width: 3840, height: 2160 }, (err, img) =>
        {
            if(err)
                console.error(err);

            let fileStream = fs.createWriteStream("terms.png");
            img.pipe(fileStream);
            log(chalk.green("Success!"));
        });
    }
})();