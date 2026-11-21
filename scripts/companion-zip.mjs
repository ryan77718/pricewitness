import {readdir,readFile} from "node:fs/promises";
import {crc32} from "node:zlib";

// A stored ZIP keeps the extension downloadable on every build without an OS-specific archiver.
export async function companionZip() {
  const files=await readdir("companion");
  const local=[],directory=[];
  let offset=0;
  for(const file of files.sort()){
    const name=Buffer.from(file),content=await readFile("companion/"+file),crc=crc32(content);
    const entry=Buffer.alloc(30);
    entry.writeUInt32LE(0x04034b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(0x21,12);
    entry.writeUInt32LE(crc,14);entry.writeUInt32LE(content.length,18);entry.writeUInt32LE(content.length,22);
    entry.writeUInt16LE(name.length,26);
    const index=Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50);index.writeUInt16LE(20,4);
    entry.copy(index,6,4,28);index.writeUInt32LE(offset,42);
    directory.push(index,name);local.push(entry,name,content);
    offset+=entry.length+name.length+content.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,central,end]);
}
