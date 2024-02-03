import { Router } from 'express'
import { sql, db } from '../db.js'
import { adminRequired } from '../utils.js'
import * as tmp from 'tmp-promise'
import { spawn } from 'child_process'
import fs from 'fs-promises-esm'
import path from 'path'

const router = Router()

router.get('/admin', adminRequired, (req, res) => {
	res.render('admin', {
		title: 'Admin Panel',
		users: sql`select id, username, role from users`.all()
	})
})

router.post('/admin/database', adminRequired, (req, res) => {
    const { action, sql } = req.body;

    if (action === 'query') {
        const result = db.prepare(sql).all();
        res.render('message', {
            title: 'Query executed successfully',
            message: `<pre>` + JSON.stringify(result, null, 2) + `</pre>`
        });
    } else if (action === 'exec') {
        console.log(sql);
        try {
            db.exec(sql);
            res.render('message', {
                title: 'SQL executed successfully',
                message: 'The SQL was executed successfully.'
            });
        } catch (e) {
            res.status(400).render('error', {
                title: 'Bad request',
                error: e.message
            });
        }
    } else {
        res.status(400).render('error', {
            title: 'Bad request',
            error: 'Invalid action.'
        });
    }
});


router.post('/admin/backup', adminRequired, async (req, res) => {
    const name = req.body.name;
    const dest = path.join('public', name + '.tar.gz');

    const backup = req.body.backup || {};
    if (!backup || !isValidTables(backup)) {
        res.status(400).render('error', {
            title: 'Bad request',
            error: 'Invalid tables selected for backup.'
        });
        return;
    }

    const { path: tmpdir, cleanup } = await tmp.dir({
        unsafeCleanup: true
    });

    for (const tbl of Object.keys(backup)) {
        if (backup[tbl]) {
            // Validate each table name before proceeding
            if (!isValidTableName(tbl)) {
                res.status(400).render('error', {
                    title: 'Bad request',
                    error: `Invalid table name: ${tbl}.`
                });
                cleanup();
                return;
            }

            await fs.writeFile(path.join(tmpdir, tbl + '.json'), JSON.stringify(sql(`SELECT * FROM ${tbl}`).all()));
        }
    }

    const child = spawn('tar', ['-cf', path.resolve(dest), ...Object.keys(backup).map(x => x + '.json')], {
        cwd: tmpdir
    });

    child.on('exit', () => {
        cleanup();
        res.render('message', {
            title: 'Backup created successfully',
            message: `Download the file <a href="/${name}.tar.gz">here</a>!`
        });
    });
});

function isValidTables(backup) {
    // Check if at least one valid table is selected
    return Object.keys(backup).some(tbl => isValidTableName(tbl));
}

function isValidTableName(tableName) {
    // Check if the table name is one of the allowed values
    const allowedTables = ['boards', 'categories', 'threads', 'posts', 'users'];
    return allowedTables.includes(tableName);
}


export default router
