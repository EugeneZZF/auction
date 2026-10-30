import styles from './Banner.module.css'
import Image from 'next/image';
import Board from '../../../public/board.png'

const Banner = () => {
    return(
        <section className={styles.sec}>
            <Image src={Board} className={styles.img} alt={'img'}/>
        </section>
    )
}

export default Banner