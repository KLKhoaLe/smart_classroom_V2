import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
@Injectable()
export class DeviceService {
 constructor(private readonly db:DataSource){}
 async resolve(ref:string,q:DataSource|EntityManager=this.db){
  const [d]=await q.query(`SELECT d.*, r.code AS room_code FROM devices d JOIN rooms r ON r.id=d.room_id WHERE (d.id::text=$1 OR d.code=$1) AND d.enabled`,[ref]);
  if(!d)throw new NotFoundException('Không tìm thấy thiết bị đang bật: '+ref);return d;
 }
 rooms(){return this.db.query(`SELECT * FROM rooms ORDER BY code`);}
 list(){return this.db.query(`SELECT d.*,r.code AS room_code,(d.last_seen>now()-interval '90 seconds') IS TRUE AS online FROM devices d JOIN rooms r ON r.id=d.room_id ORDER BY d.code`);}
 async heartbeat(ref:string){const d=await this.resolve(ref);const [row]=await this.db.query(`WITH updated AS (UPDATE devices SET last_seen=now() WHERE id=$1 RETURNING id AS device_id,last_seen) SELECT * FROM updated`,[d.id]);return {ok:true,...row};}
 offline(){return this.db.query(`SELECT id AS device_id,code,last_seen FROM devices WHERE enabled AND (last_seen IS NULL OR last_seen<now()-interval '90 seconds')`);}
 async states(ref:string){const d=await this.resolve(ref);return this.db.query(`SELECT * FROM device_states WHERE device_id=$1 ORDER BY command_type`,[d.id]);}
 async policy(room:string){const [r]=await this.db.query(`SELECT p.* FROM policies p JOIN rooms r ON r.id=p.room_id WHERE r.code=$1 AND p.active`,[room]);if(!r)throw new NotFoundException('Chưa có policy đang hoạt động.');return r;}
}
