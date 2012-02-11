var util = require("util");
var cp = require("child_process");
var fs = require("fs");
var path = require("path");
var projects = require("./project-list");


module.exports = {};
var m = module.exports;

m.withProjects = function(projects, handlers) {
    for (var i = 0, ii = projects.length; i < ii; i++) {
        var project = projects[i];

        if (typeof project == "string") {
            project = {name: project, gitUrl: "git://github.com/busterjs/" + project + ".git"}
        }
        project.localPath = path.resolve(path.join(__dirname, "..", project.name));

        projects[i] = project;
    }

    var handler = handlers.shift();
    if (handler == undefined) {
        console.log("Finished!");
        return;
    }

    util.print(handler.label + ": ");
    m.withProject(projects, 0, handler, function () {
        m.withProjects(projects, handlers);
    });
}

m.withProject = function (projects, index, handler, finished) {
    var project = projects[index++];
    if (project == null) {
        console.log();
        finished();
        return;
    }

    handler(project, function () { m.withProject(projects, index, handler, finished) });
}


m.cloneProject = function (project, cb) {
    // If the path already exists, don't do anything.
    if (directoryExists(project.localPath)) {
        cb();
        return;
    }

    cp.exec("git clone " + quote(project.gitUrl) + " " + quote(project.localPath), function (err, stdout, stderr) {
        if (err) throw err;
        util.print(".");
        cb();
    });
};
m.cloneProject.label = "Cloning projects";

m.updateProject = function (project, cb) {
    if (directoryExists(project.localPath)) {
        process.chdir(project.localPath);
        cp.exec("git pull origin master", function (err, stdout, stderr) {
            if (err) throw err;
            util.print(".");
            cb();
        });
    } else {
        m.cloneProject(project, cb);
    }
};
m.updateProject.label = "Updating projects";

m.symlinkProjectDependencies = function (project, cb) {
    var pkg = JSON.parse(fs.readFileSync(path.join(project.localPath, "package.json")));
    var pkgNodeModules = path.join(project.localPath, "node_modules");
    if (!directoryExists(pkgNodeModules)) {
        fs.mkdirSync(pkgNodeModules, 0777);
    }

    var dependencies =  [];
    if ("dependencies" in pkg) {
        for (var dependency in pkg.dependencies) {
            dependencies.push(dependency);
        }
    }

    if ("devDependencies" in pkg) {
        for (var dependency in pkg.devDependencies) {
            dependencies.push(dependency);
        }
    }

    var operator = function () {
        if (dependencies.length == 0) {
            cb();
        } else {
            var dependency = dependencies.shift();
            if (isBusterModule(dependency)) {
                var symlinkSource = path.resolve(path.join(__dirname, "..", dependency));
                var symlinkTarget = path.join(pkgNodeModules, dependency);

                var cmd;
                if (process.platform == "win32") {
                    cmd = "rmdir /s /q"
                } else {
                    cmd = "rm -rf"
                }

                function performSymlink() {
                    fs.symlinkSync(symlinkSource, symlinkTarget, "dir");
                    util.print(".");;
                    operator();
                }

                if (directoryExists(symlinkTarget)) {
                    cp.exec(cmd + " " + quote(symlinkTarget), function (error, stdout, stderr) {
                        if (error) {
                            throw new Error(error);
                        }

                        performSymlink();
                    });
                } else {
                    performSymlink();
                }
            } else {
                operator();
            }
        }
    }

    operator();
};
m.symlinkProjectDependencies.label = "Symlinking dependencies";


m.npmLinkProject = function(project, cb) {
    process.chdir(project.localPath);
    cp.exec("npm link", function (err, stdout, stderr) {
        if (err) {
            console.log(project);
            throw err;
        }
        util.print(".");
        cb();
    });
}
m.npmLinkProject.label = "npm linking";

m.updateProjectSubmodules = function(project, cb) {
    process.chdir(project.localPath);
    cp.exec("git submodule update --init", function (err, stdout, stderr) {
        if (err) throw err;
        util.print(".");
        cb();
    });
}
m.updateProjectSubmodules.label = "Initializing submodules";

function isBusterModule(module) {
    for (var i = 0, ii = projects.length; i < ii; i++) {
        if (projects[i].name == module) return true;
    }

    return false;
}

function directoryExists(path) {
    var stat;
    try {
        stat = fs.lstatSync(path);
    } catch(e) {
        return false;
    }

    if (stat.isDirectory()) {
        return true;
    } else {
        throw new Error("Expected '" + path + "' to be a directory.");
    }
}

function symlinkExists(path) {
    var stat;
    try {
        stat = fs.lstatSync(path);
    } catch(e) {
        return false;
    }

    if (stat.isSymbolicLink()) {
        return true;
    } else {
        throw new Error("Expected '" + path + "' to be a symlink.");
    }
}

function quote(path) {
    return '"' + path + '"';
}