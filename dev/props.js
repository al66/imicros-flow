
const { inspect } = require("util");

const ctx = {
    meta: {
        acl: {
            ownerId: "any",
            serviceToken: "my_token"
        }
    }
};

function third ({ meta }) {
    console.log(inspect(meta, true, 99));
}

function second ({ b, ctx: { meta: { acl: { ownerId = null, serviceId = null, ...more }} }, ...props }) {
    console.log(b);
    console.log(ownerId);
    console.log(serviceId);
    console.log(props);
    console.log({ b, ...props });
    console.log(inspect({ b, ctx, ...props }, true, 99));
    third({ meta: { acl: { ownerId, serviceId, ...more }} });
} 


function first ({ a, b, c, ...props }) {
    second({ x: "a", a, b, c, ...props });
}

first({ a:1, b:2, c:3, ctx });

const t = { settings: { services: { acl: "test" } }};

const { settings: { services: { acl } } } = t;
console.log(acl);

// ES11 - works, but throws eslint error (must set ecmaVersion: 2020, what is not possible in this bracket version)
const result = t?.settings?.services?.acl ?? "default";
console.log(result);

const { settings: { services: { acl: x = "default" } } } = t;
console.log(x);
const { settings: { services: { acl: y = "default" } } } = t;
console.log(y);


