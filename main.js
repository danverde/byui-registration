/* eslint env node, es6 */
/* eslint no-console: 0 */

var puppeteer = require('puppeteer');
const prompt = require('prompt');
const chalk = require('chalk');
const emailer = require('nodemailer');

const waitTime = 180000;


function sendEmail(msg) {
    console.log('Send Email called');
}

/*******************************
 * logs into BYU-I website 
 *******************************/
async function login(input, page) {
    await page.goto('https://secure.byui.edu/cas/login?service=https://web.byui.edu/Services/Login/?RedirectURL=https%3a%2f%2fmy.byui.edu%2f');
    await page.type('#username', input.username);
    await page.type('#password', input.password);
    await Promise.all([
        page.waitFor('#headerTabs .tab_Student'),
        page.click('.btn-login')
    ]);

    return page;
}

/*************************************
 * searches based off given criteria 
 *************************************/
async function search(input, page) {
    await page.goto('https://my.byui.edu/ICS/Academics/Academic_Information.jnz?portlet=Registration&screen=Add+Drop+Courses+BYUI&screenType=next');
    await page.evaluate((input) => {
        /* Set all given search criteria which are dropdowns */
        document.querySelector(`#pg0_V_tabSearch_ddlTermSearch option[value="${input.semester}"]`).selected = true;
        document.querySelector(`#pg0_V_tabSearch_ddlDiscipline option[value="${input.subject}"]`).selected = true;
    }, input);
    await page.type('#pg0_V_tabSearch_txtCourseRestrictor', input.courseCode);
    await Promise.all([
        page.waitForNavigation(),
        page.click('#pg0_V_tabSearch_btnSearch')
    ]);

    return page;
}


async function checkSeats(input, page) {
    return await page.evaluate((input) => {
        /* It's hard to grab how many seats are open. So I grabbed the add checkbox, went up 2 parents, and back down to the td */

        var inputButton = document.querySelector('input[title="Add ESS  127-01"]');

        if (inputButton) {
            var openSeats = inputButton.parentElement.parentElement.children[5].innerHTML.trim().split('/')[0];
        } else {
            return Promise.resolve(false);
        }

        return Promise.resolve(openSeats > 0);
    }, input);
}

/*************************************
 * Recursivly calls itself. 
 * Checks for open seats & adds if found
 * if not waits, refreshes, & tries again
 *************************************/
async function doHardWork(input, page) {

    // function wait() {
    //     return new Promise((res) => {
    //         setTimeout(() => {
    //             res();
    //         }, waitTime);
    //     });
    // }



    console.log(chalk.magenta('Looking'));
    var openSeats = await checkSeats(input, page);

    // ERROR THIS IS NEVER TRUE

    if (openSeats === true) {
        console.log(chalk.green('An open spot was found!'));

        /* select Course */
        await page.click(`input[title='Add ${input.subject}  ${input.courseCode}-${input.section}']`);
        /* Click Add */
        await Promise.all([
            page.waitForNavigation(),
            page.click('input[value="Add Courses"]')
        ]);

        // TODO verify result
        console.log(chalk.green('Attempted to add course'));
        sendEmail('Attempted to add course');

    } else {
        console.log('Nothing Found');

        /* Wait, refresh page, search again */
        setTimeout(async() => {
            await Promise.all([
                page.waitForNavigation(),
                page.click('#pg0_V_btnSearch')
            ]);
            doHardWork(input, page);
        }, waitTime);

    }
}

/*************************************
 * Do all the stuff!
 *************************************/
async function main(input) {
    var browser = await puppeteer.launch({
        headless: false
    });

    try {
        var page = await browser.newPage();
        page = await login(input, page);
        page = await search(input, page);

        doHardWork(input, page);

    } catch (err) {
        browser.close();
        sendEmail(err);
        console.error(chalk.red(err));
    }
}

function getInput(cb) {
    prompt.get([{
        name: 'semester',
        required: true,
        pattern: /^20\d{2};(?:(F)A|(W)I|(S)P|SS)(;(\1|\2|\3)[12])?$/,
        message: 'Example: 2018;FA;F1 OR 2018;FA'
    }, {
        name: 'courseCode',
        required: true,
        pattern: /^\w{2,3}\s?\d{3}\w?$/,
        message: 'Example: CS 124 OR CIT 499R'
    }, {
        name: 'section',
        required: true,
        pattern: /\d{2}/,
        message: 'Example: 02'
    }], (err, input) => {
        if (err) {
            console.error(chalk.red(err.stack));
            return;
        }

        if (!process.env.USER || !process.env.PASS) {
            console.error(chalk.red('Auth values missing'));
            return;
        }
        
        input.username = process.env.USER;
        input.password = process.env.PASS;

        input.subject = /^\w{2,3}/.exec(input.courseCode)[0]
        input.courseCode = /\d{3}\w?$/.exec(input.courseCode)[0]



        cb(input);
    });
}

getInput(main);