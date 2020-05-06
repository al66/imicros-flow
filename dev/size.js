/**
 *  Source: https://gist.github.com/zensh/4975495
 */

function memorySizeOf(obj) {
    let bytes = 0;

    function sizeOf(obj) {
        let objClass;
        if(obj !== null && obj !== undefined) {
            switch(typeof obj) {
                case "number":
                    bytes += 8;
                    break;
                case "string":
                    bytes += obj.length * 2;
                    break;
                case "boolean":
                    bytes += 4;
                    break;
                case "object":
                    objClass = Object.prototype.toString.call(obj).slice(8, -1);
                    if(objClass === "Object" || objClass === "Array") {
                        for(let key in obj) {
                            bytes += key.length * 2;
                            if(!obj.hasOwnProperty(key)) continue;
                            sizeOf(obj[key]);
                        }
                    } else {
                        bytes += obj.toString().length * 2;
                    }
                    break;
            }
        }
        return bytes;
    }

    function formatByteSize(bytes) {
        if(bytes < 1024) return { bytes: bytes, value: bytes, unit: "Bytes" };
        else if(bytes < 1048576) return { bytes: bytes, value: (bytes / 1024).toFixed(3), unit: "KB" };
        else if(bytes < 1073741824) return { bytes: bytes, value: (bytes / 1048576).toFixed(3), unit: " MB" };
        else return { bytes: bytes, value: (bytes / 1073741824).toFixed(3), unit: " GB"};
    }

    return formatByteSize(sizeOf(obj));
}

module.exports = memorySizeOf;